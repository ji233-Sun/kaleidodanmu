import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** 用户对作品的「点赞」关系（独立表，非 kind 判别器）。 */
@Entity({ name: 'effect_likes' })
@Index('uq_effect_likes_user_effect', ['userId', 'effectId'], { unique: true })
@Index('idx_effect_likes_effect', ['effectId'])
export class EffectLike {
  @PrimaryGeneratedColumn('increment', { type: 'integer', primaryKeyConstraintName: 'pk_effect_likes' })
  id!: number

  @Column({ name: 'user_id', type: 'integer', nullable: false })
  userId!: number

  @Column({ name: 'effect_id', type: 'integer', nullable: false })
  effectId!: number

  @Column({ name: 'created_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date
}
